export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  kyc_status: string;
}

export interface Asset {
  id: string;
  type: string;
  name: string;
  details: any;
  instructions: string;
  nominee_id?: string;
  created_at?: string;
}

export interface Nominee {
  id: string;
  name: string;
  email: string;
  phone?: string;
  relationship: string;
  key_share?: string;
  permissions: any;
  created_at?: string;
}

export interface Claim {
  id: string;
  status: string;
  deceased_user_id: string;
  claimant_id: string;
  submitted_at: string;
  grace_until?: string;
  evidence_path?: string;
}

export interface ClaimAction {
  id: string;
  claim_id: string;
  asset_id: string;
  action_type: string;
  status: string;
  result_notes?: string;
  executed_at?: string;
}

export interface DashboardData {
  user: User;
  assets_count: number;
  nominees_count: number;
  estate_completeness: number;
  recent_activity: ActivityItem[];
}

export interface ActivityItem {
  id: string;
  action: string;
  details: string;
  created_at: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

