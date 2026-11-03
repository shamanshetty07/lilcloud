const pgCode=(err:unknown)=>(err as {code?:string})?.code;

export const isUniqueViolation=(err:unknown)=>pgCode(err)==="23505";
export const isForeignKeyViolation=(err:unknown)=>pgCode(err)==="23503";
