import "server-only";

import { MongoClient, type Db } from "mongodb";

const uri = process.env.MONGODB_URI;
const databaseName = process.env.MONGODB_DB ?? "peernotary";

if (!uri) {
	throw new Error("Missing required server configuration: MONGODB_URI");
}

const globalForMongo = globalThis as typeof globalThis & {
	_mongoClientPromise?: Promise<MongoClient>;
};

const clientPromise =
	globalForMongo._mongoClientPromise ??
	new MongoClient(uri, {
		serverSelectionTimeoutMS: 5_000,
		maxPoolSize: 10,
	}).connect();

if (process.env.NODE_ENV !== "production") {
	globalForMongo._mongoClientPromise = clientPromise;
}

export async function getDatabase(): Promise<Db> {
	return (await clientPromise).db(databaseName);
}
