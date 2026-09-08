// This array defines every endpoint that is allowed
// Note the standardized path format with `:param`.
export const whitelistJourneyRoute = [
  // Databoard
  { method: 'GET', path: '/v1/board' },
  { method: 'POST', path: '/v1/board' },
  { method: 'PUT', path: '/v1/board/:board_id' },
  { method: 'DELETE', path: '/v1/board/:board_id' },
  { method: 'GET', path: '/v1/board/:board_id' },
  { method: 'POST', path: '/v1/board/:board_id/board_fields' },
  { method: 'PUT', path: '/v1/board/:board_id/board_fields/:field_id' },
  { method: 'PUT', path: '/v1/board/:board_id/board_fields/_order' },

  // DataBoard item
  { method: 'GET', path: '/v1/board/:board_id/board_items' },
  { method: 'POST', path: '/v1/board/:board_id/board_items' }, // Assumed for "Update multiple uploads"
  { method: 'DELETE', path: '/v1/board/:board_id/board_items' }, // For "Delete by IDs"
  { method: 'GET', path: '/v1/board/:board_id/board_items/:item_id' },
  { method: 'DELETE', path: '/v1/board/:board_id/board_items/:item_id' },

  // Workflow
  { method: 'GET', path: '/api/v1/workflows/:workflow_id' },
  { method: 'POST', path: '/api/v1/workflows/verify' }, // Assumed POST for verification
  { method: 'PUT', path: '/v1/workflow/:workflow_id' }, // Note: Your path had /v1/workflow, not /workflows
  { method: 'PUT', path: '/v1/workflows/:workflow_id/status' },

  // Channel
  { method: 'POST', path: '/v1/channels' },
  { method: 'PUT', path: '/v1/channels/:channel_id' },
  { method: 'DELETE', path: '/v1/channels/:channel_id' },

  // App
  { method: 'PUT', path: '/v2/apps/settings/:app_id' },
  { method: 'POST', path: '/v2/apps/submit/:app_id' },
  { method: 'GET', path: '/v2/apps/status' },
  { method: 'GET', path: '/v2/apps/:app_id' },

  // AI Assistant
  { method: 'GET', path: '/v2/ai/assistants' },
  { method: 'POST', path: '/v2/ai/assistants' },
  { method: 'PUT', path: '/v2/ai/assistants/:assistant_id' },
  { method: 'DELETE', path: '/v2/ai/assistants/:assistant_id' },
  { method: 'POST', path: '/v2/ai/assistant_apps' },
  { method: 'PUT', path: '/v2/ai/assistant_apps/:assistant_id' },
  { method: 'DELETE', path: '/v2/ai/assistant_apps/:assistant_id' },
];
