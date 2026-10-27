import { prisma } from "../lib/prisma.ts";
import { toDto } from "../files/files.service.ts";
import { notFound, forbidden, conflict, isUniqueViolation, isUuid } from "../lib/errors.ts";

type Tx=Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
type Role="admin"|"member";

// membership changes for one group run one at a time so the "at least one admin" rule
// cannot be beaten by two admins demoting each other at the same moment
const lockGroup=(tx:Tx,groupId:string)=>tx.$executeRaw`SELECT pg_advisory_xact_lock(2, hashtext(${groupId}))`;

// non-members get the same 404 as a group that does not exist, so group ids cannot be probed
export const requireMember=async(userId:number,groupId:string,db:Tx|typeof prisma=prisma)=>{
    if(!isUuid(groupId)) throw notFound("Group not found");
    const member=await db.groupMember.findUnique({where:{group_id_user_id:{group_id:groupId,user_id:userId}}});
    if(!member) throw notFound("Group not found");
    return member;
}
export const requireAdmin=async(userId:number,groupId:string,db:Tx|typeof prisma=prisma)=>{
    const member=await requireMember(userId,groupId,db);
    if(member.role!=="admin") throw forbidden("Only group admins can do that");
    return member;
}

const toGroupDto=(g:{group_id:string,group_name:string,created_at:Date,updated_at:Date,_count:{members:number,files:number}},role:Role)=>({
    id:g.group_id,
    name:g.group_name,
    role,
    memberCount:g._count.members,
    fileCount:g._count.files,
    createdAt:g.created_at,
    updatedAt:g.updated_at
});
const counts={select:{members:true,files:true}} as const;

export const createGroupService=async(userId:number,name:string)=>{
    const group=await prisma.storageGroup.create({
        data:{group_name:name,created_by:userId,members:{create:{user_id:userId,role:"admin"}}},
        include:{_count:counts}
    });
    return toGroupDto(group,"admin");
}

export const listGroupsService=async(userId:number)=>{
    const rows=await prisma.groupMember.findMany({
        where:{user_id:userId},
        include:{group:{include:{_count:counts}}},
        orderBy:{group:{group_name:"asc"}}
    });
    return {groups:rows.map(r=>toGroupDto(r.group,r.role))};
}

export const getGroupService=async(userId:number,groupId:string)=>{
    const me=await requireMember(userId,groupId);
    const group=await prisma.storageGroup.findUnique({where:{group_id:groupId},include:{_count:counts}});
    if(!group) throw notFound("Group not found");
    return toGroupDto(group,me.role);
}

export const renameGroupService=async(userId:number,groupId:string,name:string)=>{
    await requireAdmin(userId,groupId);
    const group=await prisma.storageGroup.update({where:{group_id:groupId},data:{group_name:name},include:{_count:counts}});
    return toGroupDto(group,"admin");
}

// removes the group, its memberships and its file links. the files themselves stay with their owners
export const deleteGroupService=async(userId:number,groupId:string)=>{
    await prisma.$transaction(async tx=>{
        await lockGroup(tx,groupId);
        await requireAdmin(userId,groupId,tx);
        await tx.storageGroup.delete({where:{group_id:groupId}});
    });
}

export const listMembersService=async(userId:number,groupId:string)=>{
    await requireMember(userId,groupId);
    const rows=await prisma.groupMember.findMany({
        where:{group_id:groupId},
        include:{user:{select:{user_id:true,username:true}}},
        orderBy:{joined_at:"asc"}
    });
    return {members:rows.map(r=>({userId:r.user_id,username:r.user.username,role:r.role,joinedAt:r.joined_at}))};
}

export const addMemberService=async(actorId:number,groupId:string,identifier:string,role:Role)=>{
    try{
        return await prisma.$transaction(async tx=>{
            await lockGroup(tx,groupId);
            await requireAdmin(actorId,groupId,tx);
            const user=await tx.user.findFirst({
                where:{is_active:true,OR:[{username:identifier},{email:identifier.toLowerCase()}]},
                select:{user_id:true,username:true}
            });
            if(!user) throw notFound("No user found with that username or email");
            const m=await tx.groupMember.create({data:{group_id:groupId,user_id:user.user_id,role}});
            return {userId:user.user_id,username:user.username,role:m.role,joinedAt:m.joined_at};
        });
    }
    catch(err){
        if(isUniqueViolation(err)) throw conflict("That user is already in the group");
        throw err;
    }
}

const adminCount=(tx:Tx,groupId:string)=>tx.groupMember.count({where:{group_id:groupId,role:"admin"}});
const LAST_ADMIN="A group needs at least one admin. Make someone else an admin first, or delete the group";

export const setMemberRoleService=async(actorId:number,groupId:string,targetId:number,role:Role)=>{
    return prisma.$transaction(async tx=>{
        await lockGroup(tx,groupId);
        await requireAdmin(actorId,groupId,tx);
        const target=await tx.groupMember.findUnique({where:{group_id_user_id:{group_id:groupId,user_id:targetId}}});
        if(!target) throw notFound("Member not found");
        if(target.role==="admin" && role==="member" && await adminCount(tx,groupId)<=1) throw conflict(LAST_ADMIN);
        const m=await tx.groupMember.update({where:{group_id_user_id:{group_id:groupId,user_id:targetId}},data:{role}});
        return {userId:m.user_id,role:m.role,joinedAt:m.joined_at};
    });
}

// admins can remove anyone, any member can remove themselves (leave). files they shared stay in the group
export const removeMemberService=async(actorId:number,groupId:string,targetId:number)=>{
    await prisma.$transaction(async tx=>{
        await lockGroup(tx,groupId);
        const actor=await requireMember(actorId,groupId,tx);
        if(actorId!==targetId && actor.role!=="admin") throw forbidden("Only group admins can remove members");
        const target=await tx.groupMember.findUnique({where:{group_id_user_id:{group_id:groupId,user_id:targetId}}});
        if(!target) throw notFound("Member not found");
        if(target.role==="admin" && await adminCount(tx,groupId)<=1) throw conflict(LAST_ADMIN);
        await tx.groupMember.delete({where:{group_id_user_id:{group_id:groupId,user_id:targetId}}});
    });
}

const toGroupFileDto=(l:{shared_at:Date,sharer:{user_id:number,username:string},file:Parameters<typeof toDto>[0]})=>({
    ...toDto(l.file),
    uploadedBy:{id:l.sharer.user_id,name:l.sharer.username},
    sharedAt:l.shared_at
});
const linkInclude={file:true,sharer:{select:{user_id:true,username:true}}} as const;

export const listGroupFilesService=async(userId:number,groupId:string)=>{
    await requireMember(userId,groupId);
    const links=await prisma.groupFile.findMany({where:{group_id:groupId},include:linkInclude,orderBy:{shared_at:"desc"}});
    return {files:links.map(toGroupFileDto)};
}

// the link for a file inside a group, only for members. null file id / not linked both read as not found
export const findGroupFile=async(userId:number,groupId:string,fileId:string)=>{
    await requireMember(userId,groupId);
    if(!isUuid(fileId)) throw notFound("File not found");
    const link=await prisma.groupFile.findUnique({where:{group_id_file_id:{group_id:groupId,file_id:fileId}},include:{file:true}});
    if(!link) throw notFound("File not found");
    return link;
}

// shares a file you own with the group: just a link, the content is not copied
export const shareFileService=async(userId:number,groupId:string,fileId:string)=>{
    try{
        return await prisma.$transaction(async tx=>{
            await requireMember(userId,groupId,tx);
            const file=await tx.file.findFirst({where:{file_id:fileId,owner_id:userId},select:{file_id:true}});
            if(!file) throw notFound("File not found");
            return toGroupFileDto(await tx.groupFile.create({data:{group_id:groupId,file_id:fileId,shared_by:userId},include:linkInclude}));
        });
    }
    catch(err){
        if(isUniqueViolation(err)) throw conflict("That file is already shared with this group");
        throw err;
    }
}

// removes the link only. whoever shared it, or an admin, can do this; the file itself is never deleted here
export const unshareFileService=async(userId:number,groupId:string,fileId:string)=>{
    const member=await requireMember(userId,groupId);
    if(!isUuid(fileId)) throw notFound("File not found");
    const link=await prisma.groupFile.findUnique({where:{group_id_file_id:{group_id:groupId,file_id:fileId}}});
    if(!link) throw notFound("File not found");
    if(link.shared_by!==userId && member.role!=="admin") throw forbidden("Only the sharer or a group admin can remove this file from the group");
    await prisma.groupFile.delete({where:{group_file_id:link.group_file_id}});
}
