export type Role = "SUPER_ADMIN" | "ADMIN";

export type UserStatus = "ACTIVE" | "DISABLED" | "BLOCKED";

export type OrderStatus =
  | "PENDING"
  | "REVIEWING"
  | "IN_PROGRESS"
  | "RESOLVED"
  | "REJECTED"
  | "CLOSED"
  | "COMPLETED"
  | "ARCHIVED";

export type ComplaintStatus = Exclude<OrderStatus, "COMPLETED" | "ARCHIVED"> | "IN_PROGRESS" | "RESOLVED" | "CLOSED";

export type BotStatus = "STOPPED" | "RUNNING" | "ERROR";

export type FieldType =
  | "TEXT"
  | "EMAIL"
  | "PASSWORD"
  | "NUMBER"
  | "PHONE"
  | "URL"
  | "DATE"
  | "DATETIME"
  | "SELECT"
  | "RADIO"
  | "CHECKBOX"
  | "TEXTAREA"
  | "FILE"
  | "IMAGE"
  | "INSTRUCTION"
  | "CONFIRMATION"
  | "DYNAMIC";

export type ConversationState =
  | "IDLE"
  | "SELECTING_REQUEST"
  | "CREATING_ORDER"
  | "WAITING_FOR_FIELD"
  | "WAITING_FOR_FILE"
  | "REVIEW"
  | "SUBMITTED"
  | "CANCELLED";

export type NotificationType =
  | "NEW_COMPLAINT"
  | "COMPLAINT_STATUS_CHANGED"
  | "NEW_COMPLAINT_MESSAGE"
  | "NEW_COMPLAINT_ATTACHMENT"
  | "COMPLAINT_ASSIGNED"
  | "SECURITY_EVENT"
  | "SYSTEM_EVENT"
  | "NEW_ORDER"
  | "ORDER_STATUS_CHANGED"
  | "ORDER_MESSAGE"
  | "FILE_RECEIVED"
  | "BOT_ERROR"
  | "BOT_STARTED"
  | "BOT_STOPPED"
  | "SYSTEM"
  | "SECURITY";

export type FilterOperator =
  | "eq"
  | "neq"
  | "contains"
  | "not_contains"
  | "starts_with"
  | "ends_with"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "between"
  | "yes"
  | "no"
  | "before"
  | "after";

export type FilePurpose =
  | "REQUEST_IMAGE"
  | "PAYMENT_PROOF"
  | "ORDER_ATTACHMENT"
  | "ADMIN_ATTACHMENT"
  | "BOT_MEDIA"
  | "BOT_LOGO"
  | "USER_AVATAR";

export interface RequestField {
  id: string;
  name: string;
  label: string;
  type: FieldType;
  placeholder?: string;
  description?: string;
  telegramMessage?: string;
  telegramPrompt?: TelegramPrompt;
  required: boolean;
  sensitive: boolean;
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
  };
  options?: { value: string; label: string }[];
  order: number;
  active: boolean;
  imageFileId?: string;
  attachmentFileId?: string;
}

/**
 * Content the bot sends to ask a field's question (not the user's answer).
 * New block kinds (video, location, buttons, media_group) are added
 * as new union members plus a renderer step; existing blocks stay untouched.
 */
export type TelegramPromptBlockType = "text" | "image" | "document" | "audio";

export interface TelegramPromptTextBlock {
  id: string;
  type: "text";
  text: string;
}

export interface TelegramPromptMediaBlock<T extends "image" | "document" | "audio"> {
  id: string;
  type: T;
  storageId: string;
  fileName?: string;
  mimeType?: string;
  size?: number;
}

export type TelegramPromptImageBlock = TelegramPromptMediaBlock<"image">;
export type TelegramPromptDocumentBlock = TelegramPromptMediaBlock<"document">;
export type TelegramPromptAudioBlock = TelegramPromptMediaBlock<"audio">;

export type TelegramPromptBlock =
  | TelegramPromptTextBlock
  | TelegramPromptImageBlock
  | TelegramPromptDocumentBlock
  | TelegramPromptAudioBlock;

export interface TelegramPrompt {
  blocks: TelegramPromptBlock[];
}

export type BranchOperator = "equals" | "not_equals" | "contains" | "is_empty" | "is_not_empty";
export type BranchAction = "show" | "hide" | "goto";

export interface BranchingRule {
  id: string;
  sourceFieldId: string;
  operator: BranchOperator;
  value?: string;
  action: BranchAction;
  targetFieldId: string;
}

export interface OrderAdminFields {
  adminNotes: string;
  attachmentFileId: string | null;
  attachmentFilename: string | null;
}

export interface OrderFilter {
  field: string;
  operator: FilterOperator;
  value?: unknown;
  valueTo?: unknown;
}

export interface SessionUser {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  status: UserStatus;
  twoFactorEnabled: boolean;
}
