export type Role = "SUPER_ADMIN" | "ADMIN";

export type UserStatus = "ACTIVE" | "DISABLED" | "BLOCKED";

export type OrderStatus =
  | "PENDING"
  | "REVIEWING"
  | "COMPLETED"
  | "REJECTED"
  | "ARCHIVED";

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
  | "CONFIRMATION";

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

export interface OrderAdminFields {
  shamCashReceiptNumber: string;
  adminNotes: string;
  invoiceNumber: string;
  paymentDate: string;
  invoiceFileId: string | null;
  invoiceFilename: string | null;
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
