import IUserContext from "./src/core/models/user_context";

// to make the file a module and avoid the TypeScript error
export { };

// Extend Express Interfaces  
declare global {
  namespace Express {
    export interface Request {
      userContext: IUserContext;
      rawBody: string;
    }
  }
}
