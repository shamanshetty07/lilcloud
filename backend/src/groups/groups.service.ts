import { randomUUID } from "node:crypto";
import { pool, transaction, type Db } from "../db/client.ts";
import { toDto } from "../files/files.service.ts";
import { notFound, forbidden, conflict, isUniqueViolation, isUuid } from "../lib/errors.ts";
import { cached, cacheOn, invalidate, scopes, TTL } from "../cache/cache.ts";
import { findActiveUserByIdentifier } from "../auth/users.repository.ts";
import * as repo from "./groups.repository.ts";
import { findOwnedFile } from "../files/files.repository.ts";

type Role=repo.GroupRole;

export const requireMember=async(userId:number,groupId:string,db:Db=pool)=>{
    if(!isUuid(groupId)) throw notFound("Group not found");
    const member=await repo.findMembership(db,groupId,userId);
    if(!member) throw notFound("Group not found");
    return member;
}
export const requireAdmin=async(userId:number,groupId:string,db:Db=pool)=>{
    const member=await requireMember(userId,groupId,db);
    if(member.role!=="admin") throw forbidden("Only group admins can do that");
    return member;
}

const toGroupBase=(g:repo.GroupRow)=>({
    id:g.group_id,
    name:g.group_name,
    memberCount:g.member_count,
    fileCount:g.file_count,
    createdAt:g.created_at,
    updatedAt:g.updated_at
});
const withRole=(b:ReturnType<typeof toGroupBase>,role:Role)=>({id:b.id,name:b.name,role,memberCount:b.memberCount,fileCount:b.fileCount,createdAt:b.createdAt,updatedAt:b.updatedAt});
const toGroupDto=(g:repo.GroupRow,role:Role)=>withRole(toGroupBase(g),role);
const memberRecents=async(db:Db,groupId:string)=>!cacheOn()?[]:
    (await repo.listMemberIds(db,groupId)).map(m=>scopes.userRecent(m.user_id));

export const createGroupService=async(userId:number,name:string)=>{
    const group=await transaction(async tx=>{
        const groupId=randomUUID();
        await repo.insertGroup(tx,{group_id:groupId,group_name:name,created_by:userId});
        await repo.insertMember(tx,groupId,userId,"admin");
        return (await repo.findGroupWithCounts(tx,groupId))!;
    });
    return toGroupDto(group,"admin");
}

export const listGroupsService=async(userId:number)=>{
    const rows=await repo.listGroupsForUser(pool,userId);
    return {groups:rows.map(r=>toGroupDto(r,r.role))};
}

export const getGroupService=async(userId:number,groupId:string)=>{
    const me=await requireMember(userId,groupId);
    const base=await cached({
        scope:scopes.group(groupId),key:"meta",ttl:TTL.group,
        validate:(v):v is ReturnType<typeof toGroupBase>=>typeof (v as any)?.id==="string" && typeof (v as any)?.memberCount==="number",
        load:async()=>{
            const group=await repo.findGroupWithCounts(pool,groupId);
            if(!group) throw notFound("Group not found");
            return toGroupBase(group);
        }
    });
    return withRole(base,me.role);
}

export const renameGroupService=async(userId:number,groupId:string,name:string)=>{
    await requireAdmin(userId,groupId);
    const group=await repo.renameGroup(pool,groupId,name);
    if(!group) throw notFound("Group not found");
    await invalidate(scopes.group(groupId));
    return toGroupDto(group,"admin");
}

export const deleteGroupService=async(userId:number,groupId:string)=>{
    const affected=await transaction(async tx=>{
        await repo.lockGroup(tx,groupId);
        await requireAdmin(userId,groupId,tx);
        const recents=await memberRecents(tx,groupId);
        if(!await repo.deleteGroup(tx,groupId)) throw notFound("Group not found");
        return recents;
    });
    await invalidate(scopes.group(groupId),...affected);
}

export const listMembersService=async(userId:number,groupId:string)=>{
    await requireMember(userId,groupId);
    return cached({
        scope:scopes.group(groupId),key:"members",ttl:TTL.group,
        validate:(v):v is {members:unknown[]}=>Array.isArray((v as any)?.members),
        load:async()=>{
            const rows=await repo.listMembersWithUsernames(pool,groupId);
            return {members:rows.map(r=>({userId:r.user_id,username:r.username,role:r.role,joinedAt:r.joined_at}))};
        }
    });
}

export const addMemberService=async(actorId:number,groupId:string,identifier:string,role:Role)=>{
    try{
        const member=await transaction(async tx=>{
            await repo.lockGroup(tx,groupId);
            await requireAdmin(actorId,groupId,tx);
            const user=await findActiveUserByIdentifier(tx,identifier,identifier.toLowerCase());
            if(!user) throw notFound("No user found with that username or email");
            const m=await repo.insertMember(tx,groupId,user.user_id,role);
            return {userId:user.user_id,username:user.username,role:m.role,joinedAt:m.joined_at};
        });
        await invalidate(scopes.group(groupId),scopes.userRecent(member.userId));
        return member;
    }
    catch(err){
        if(isUniqueViolation(err)) throw conflict("That user is already in the group");
        throw err;
    }
}

const adminCount=(tx:Db,groupId:string)=>repo.countAdmins(tx,groupId);
const LAST_ADMIN="A group needs at least one admin. Make someone else an admin first, or delete the group";

export const setMemberRoleService=async(actorId:number,groupId:string,targetId:number,role:Role)=>{
    const result=await transaction(async tx=>{
        await repo.lockGroup(tx,groupId);
        await requireAdmin(actorId,groupId,tx);
        const target=await repo.findMembership(tx,groupId,targetId);
        if(!target) throw notFound("Member not found");
        if(target.role==="admin" && role==="member" && await adminCount(tx,groupId)<=1) throw conflict(LAST_ADMIN);
        const m=await repo.setMemberRole(tx,groupId,targetId,role);
        if(!m) throw notFound("Member not found");
        return {userId:m.user_id,role:m.role,joinedAt:m.joined_at};
    });
    await invalidate(scopes.group(groupId));
    return result;
}

export const removeMemberService=async(actorId:number,groupId:string,targetId:number)=>{
    await transaction(async tx=>{
        await repo.lockGroup(tx,groupId);
        const actor=await requireMember(actorId,groupId,tx);
        if(actorId!==targetId && actor.role!=="admin") throw forbidden("Only group admins can remove members");
        const target=await repo.findMembership(tx,groupId,targetId);
        if(!target) throw notFound("Member not found");
        if(target.role==="admin" && await adminCount(tx,groupId)<=1) throw conflict(LAST_ADMIN);
        if(!await repo.deleteMember(tx,groupId,targetId)) throw notFound("Member not found");
    });
    await invalidate(scopes.group(groupId),scopes.userRecent(targetId));
}

const toGroupFileDto=(l:repo.GroupFileWithSharer)=>({
    ...toDto(l.file),
    uploadedBy:{id:l.sharer.user_id,name:l.sharer.username},
    sharedAt:l.shared_at
});

export const listGroupFilesService=async(userId:number,groupId:string)=>{
    await requireMember(userId,groupId);
    return cached({
        scope:scopes.group(groupId),key:"files",ttl:TTL.group,
        validate:(v):v is {files:unknown[]}=>Array.isArray((v as any)?.files),
        load:async()=>{
            const links=await repo.listLiveGroupFiles(pool,groupId);
            return {files:links.map(toGroupFileDto)};
        }
    });
}

export const findGroupFile=async(userId:number,groupId:string,fileId:string)=>{
    await requireMember(userId,groupId);
    if(!isUuid(fileId)) throw notFound("File not found");
    const link=await repo.findGroupFileLink(pool,groupId,fileId);
    if(!link || link.file.deleted_at) throw notFound("File not found");
    return link;
}

export const shareFileService=async(userId:number,groupId:string,fileId:string)=>{
    try{
        const dto=await transaction(async tx=>{
            await requireMember(userId,groupId,tx);
            const file=await findOwnedFile(tx,fileId,userId,false);
            if(!file) throw notFound("File not found");
            await repo.insertGroupFile(tx,groupId,fileId,userId);
            return toGroupFileDto((await repo.findGroupFileLink(tx,groupId,fileId))!);
        });
        await invalidate(scopes.group(groupId));
        return dto;
    }
    catch(err){
        if(isUniqueViolation(err)) throw conflict("That file is already shared with this group");
        throw err;
    }
}

export const unshareFileService=async(userId:number,groupId:string,fileId:string)=>{
    const member=await requireMember(userId,groupId);
    if(!isUuid(fileId)) throw notFound("File not found");
    const link=await repo.findGroupFileLink(pool,groupId,fileId);
    if(!link) throw notFound("File not found");
    if(link.shared_by!==userId && member.role!=="admin") throw forbidden("Only the sharer or a group admin can remove this file from the group");
    const recents=await memberRecents(pool,groupId);
    if(!await repo.deleteGroupFile(pool,link.group_file_id)) throw notFound("File not found");
    await invalidate(scopes.group(groupId),...recents);
}
