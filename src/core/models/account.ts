export default interface Account {
    object_name: string;
    id: string;
    organization_id: string;
    display_name: string;
    avatar_url: string;
    gender: string;
    first_name: string;
    last_name: string;
    address_line1: string;
    address_line2: string;
    area_code: string;
    phone_number: string;
    email: string;
    language: string;
    role: string;
    status: string;
    is_active: boolean;
    is_archived: boolean;
    created_at: string;
    updated_at: string;
    team_roles: Array<{
        object_name: string;
        id: string;
        organization_id: string;
        business_unit_id: string;
        team_id: string;
        user_id: string;
        role: string;
        team: {
            object_name: string;
            id: string;
            organization_id: string;
            business_unit_id: string;
            name: string;
            mode: string;
            icon_url: string;
            description: string;
            is_default: boolean;
            created_at: string;
            updated_at: string;
        };
    }>;
}