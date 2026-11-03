import { rows, one, execute, type Db } from "../db/query.ts";
import { FILE_COLUMNS, type FileRow } from "../files/files.repository.ts";

export type GroupRole="admin"|"member";

export type MemberRow = {group_id:string,user_id:number,role:GroupRole,joined_at:Date};

export type GroupRow = {
    group_id:string,
    group_name:string,
    created_by:number,
    created_at:Date,
    updated_at:Date,
    member_count:number,
    file_count:number
};

export type GroupFileRow = {
    group_file_id:number,
    group_id:string,
    file_id:string,
    shared_by:number,
    shared_at:Date
};

export type GroupFileWithFile = GroupFileRow & {file:FileRow};
export type GroupFileWithSharer = GroupFileWithFile & {sharer:{user_id:number,username:string}};

const MEMBER_COLUMNS=`group_id, user_id, role, joined_at`;

const GROUP_WITH_COUNTS=`g.group_id, g.group_name, g.created_by, g.created_at, g.updated_at,
    (SELECT count(*)::int FROM group_members m WHERE m.group_id = g.group_id) AS member_count,
    (SELECT count(*)::int FROM group_files gf JOIN files f ON f.file_id = gf.file_id WHERE gf.group_id = g.group_id AND f.deleted_at IS NULL) AS file_count`;

export const lockGroup=(db:Db,groupId:string)=>
    db.query(`SELECT pg_advisory_xact_lock(2, hashtext($1))`,[groupId]);

export const findMembership=(db:Db,groupId:string,userId:number)=>
    one<MemberRow>(db,`SELECT ${MEMBER_COLUMNS} FROM group_members WHERE group_id = $1 AND user_id = $2`,[groupId,userId]);

export const listMemberIds=(db:Db,groupId:string)=>
    rows<{user_id:number}>(db,`SELECT user_id FROM group_members WHERE group_id = $1`,[groupId]);

export const insertGroup=(db:Db,data:{group_id:string,group_name:string,created_by:number})=>
    db.query(`INSERT INTO storage_groups (group_id, group_name, created_by, updated_at) VALUES ($1, $2, $3, $4)`,
        [data.group_id,data.group_name,data.created_by,new Date()]);

export const findGroupWithCounts=(db:Db,groupId:string)=>
    one<GroupRow>(db,`SELECT ${GROUP_WITH_COUNTS} FROM storage_groups g WHERE g.group_id = $1`,[groupId]);

export const listGroupsForUser=(db:Db,userId:number)=>
    rows<GroupRow & {role:GroupRole}>(db,
        `SELECT ${GROUP_WITH_COUNTS}, gm.role FROM group_members gm JOIN storage_groups g ON g.group_id = gm.group_id
         WHERE gm.user_id = $1 ORDER BY g.group_name ASC`,
        [userId]);

export const renameGroup=(db:Db,groupId:string,name:string)=>
    one<GroupRow>(db,
        `WITH updated AS (
            UPDATE storage_groups SET group_name = $2, updated_at = $3 WHERE group_id = $1
            RETURNING group_id, group_name, created_by, created_at, updated_at
        )
        SELECT ${GROUP_WITH_COUNTS} FROM updated g`,
        [groupId,name,new Date()]);

export const deleteGroup=(db:Db,groupId:string)=>
    execute(db,`DELETE FROM storage_groups WHERE group_id = $1`,[groupId]);

export const listMembersWithUsernames=(db:Db,groupId:string)=>
    rows<MemberRow & {username:string}>(db,
        `SELECT gm.group_id, gm.user_id, gm.role, gm.joined_at, u.username
         FROM group_members gm JOIN users u ON u.user_id = gm.user_id
         WHERE gm.group_id = $1 ORDER BY gm.joined_at ASC`,
        [groupId]);

export const insertMember=async(db:Db,groupId:string,userId:number,role:GroupRole)=>
    (await one<MemberRow>(db,
        `INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, $3) RETURNING ${MEMBER_COLUMNS}`,
        [groupId,userId,role]))!;

export const countAdmins=async(db:Db,groupId:string)=>
    (await one<{n:number}>(db,`SELECT count(*)::int AS n FROM group_members WHERE group_id = $1 AND role = 'admin'`,[groupId]))!.n;

export const setMemberRole=(db:Db,groupId:string,userId:number,role:GroupRole)=>
    one<MemberRow>(db,`UPDATE group_members SET role = $3 WHERE group_id = $1 AND user_id = $2 RETURNING ${MEMBER_COLUMNS}`,[groupId,userId,role]);

export const deleteMember=(db:Db,groupId:string,userId:number)=>
    execute(db,`DELETE FROM group_members WHERE group_id = $1 AND user_id = $2`,[groupId,userId]);

export const insertGroupFile=async(db:Db,groupId:string,fileId:string,sharedBy:number)=>
    (await one<GroupFileRow>(db,
        `INSERT INTO group_files (group_id, file_id, shared_by) VALUES ($1, $2, $3)
         RETURNING group_file_id, group_id, file_id, shared_by, shared_at`,
        [groupId,fileId,sharedBy]))!;

type LinkJoinRow = GroupFileRow & FileRow & {sharer_username:string};

const LINK_SELECT=`SELECT gf.group_file_id, gf.group_id, gf.shared_by, gf.shared_at, ${FILE_COLUMNS}, u.username AS sharer_username`;

const toLink=(r:LinkJoinRow):GroupFileWithSharer=>({
    group_file_id:r.group_file_id,
    group_id:r.group_id,
    file_id:r.file_id,
    shared_by:r.shared_by,
    shared_at:r.shared_at,
    file:{
        file_id:r.file_id,
        owner_id:r.owner_id,
        file_name:r.file_name,
        file_size:r.file_size,
        file_type:r.file_type,
        uploaded_at:r.uploaded_at,
        deleted_at:r.deleted_at,
        folder_id:r.folder_id
    },
    sharer:{user_id:r.shared_by,username:r.sharer_username}
});

export const listLiveGroupFiles=async(db:Db,groupId:string)=>
    (await rows<LinkJoinRow>(db,
        `${LINK_SELECT}
         FROM group_files gf JOIN files f ON f.file_id = gf.file_id JOIN users u ON u.user_id = gf.shared_by
         WHERE gf.group_id = $1 AND f.deleted_at IS NULL
         ORDER BY gf.shared_at DESC`,
        [groupId])).map(toLink);

export const findGroupFileLink=async(db:Db,groupId:string,fileId:string)=>{
    const row=await one<LinkJoinRow>(db,
        `${LINK_SELECT}
         FROM group_files gf JOIN files f ON f.file_id = gf.file_id JOIN users u ON u.user_id = gf.shared_by
         WHERE gf.group_id = $1 AND gf.file_id = $2`,
        [groupId,fileId]);
    return row?toLink(row):null;
}

export const deleteGroupFile=(db:Db,groupFileId:number)=>
    execute(db,`DELETE FROM group_files WHERE group_file_id = $1`,[groupFileId]);
