// Mock postgres module for client build
// This should never be called in client code
export default function postgres() {
	throw new Error("postgres should not be used in client code");
}
