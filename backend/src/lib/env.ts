if (!process.env.PORT) {
    throw new Error("PORT is missing")
}

if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is missing")
}

export const env = {
    PORT: process.env.PORT,
    DATABASE_URL: process.env.DATABASE_URL,
}


