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

async function getClient(): Promise<MongoClient> {
	if (!globalForMongo._mongoClientPromise) {
		const client = new MongoClient(uri as string, {
			serverSelectionTimeoutMS: 5_000,
			maxPoolSize: 10,
		});
		globalForMongo._mongoClientPromise = client.connect().catch((error) => {
			globalForMongo._mongoClientPromise = undefined;
			throw error;
		});
	}
	return globalForMongo._mongoClientPromise;
}

export async function getDatabase(): Promise<Db> {
	return (await getClient()).db(databaseName);
}
