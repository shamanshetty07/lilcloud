import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// runs before every test file. when TEST_DATABASE_URL is set it replaces DATABASE_URL for the whole run, so no
// module (including ones imported by older tests) can bind to the real database from .env
const url=process.env.TEST_DATABASE_URL;
if(url){
    const u=new URL(url);
    if(!/test/i.test(u.pathname)) throw new Error("TEST_DATABASE_URL must point at a database whose name contains 'test'");
    if(!["localhost","127.0.0.1","[::1]"].includes(u.hostname)) throw new Error("TEST_DATABASE_URL must be a local database");
    process.env.DATABASE_URL=url;
    process.env.JWT_SECRET="test-secret";
    process.env.PORT="0";
    process.env.MONGODB_URI="mongodb://unused";
    process.env.STORAGE_DIR=mkdtempSync(join(tmpdir(),"lilcloud-test-"));
}
