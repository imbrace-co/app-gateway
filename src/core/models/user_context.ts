export default interface IUserContext {
  org_id?: string;
  access_token?: string;
  user_id?: string;
  email?: string;
  business_unit_id?: string;
  api_permissions?: Record<string, ApiPermissions>;
  api_key?: string;
  is_proxy_token?: boolean;
}

// Interface for API permissions
export interface ApiPermissions {
  read: boolean;
  write: boolean;
}
