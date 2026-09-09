export type SendStage =
  | "idle"
  | "signing_in"
  | "setting_up_wallet"
  | "resolving_recipient"
  | "preparing_gift"
  | "approving_test_usdc"
  | "sending_gift"
  | "confirming_on_base"
  | "delivering_to_inbox"
  | "complete"
  | "error";

export type SendState = {
  stage: SendStage;
  apiGiftId: string | null;
  txHash: string | null;
  error: string | null;
  usePermit: boolean;
};

export type SendAction =
  | { type: "reset" }
  | { type: "stage"; stage: SendStage }
  | { type: "error"; error: string }
  | { type: "prepared"; apiGiftId: string; usePermit: boolean }
  | { type: "submitted"; txHash: string }
  | { type: "complete" };

export const initialSendState: SendState = {
  stage: "idle",
  apiGiftId: null,
  txHash: null,
  error: null,
  usePermit: true,
};

export function sendReducer(state: SendState, action: SendAction): SendState {
  switch (action.type) {
    case "reset":
      return initialSendState;
    case "stage":
      return { ...state, stage: action.stage, error: null };
    case "error":
      return { ...state, stage: "error", error: action.error };
    case "prepared":
      return {
        ...state,
        apiGiftId: action.apiGiftId,
        usePermit: action.usePermit,
        stage: action.usePermit ? "sending_gift" : "approving_test_usdc",
      };
    case "submitted":
      return {
        ...state,
        txHash: action.txHash,
        stage: "confirming_on_base",
      };
    case "complete":
      return { ...state, stage: "complete", error: null };
    default:
      return state;
  }
}

export const SEND_PROGRESS_STAGES = [
  { id: "signing_in", label: "Signing in" },
  { id: "setting_up_wallet", label: "Setting up wallet" },
  { id: "resolving_recipient", label: "Resolving recipient" },
  { id: "preparing_gift", label: "Preparing gift" },
  { id: "approving_test_usdc", label: "Approving test USDC" },
  { id: "sending_gift", label: "Sending gift" },
  { id: "confirming_on_base", label: "Confirming on Base" },
  { id: "delivering_to_inbox", label: "Delivering to inbox" },
  { id: "complete", label: "Complete" },
] as const;

const RESUME_KEY = "wisp:send-resume";

export type SendResume = {
  apiGiftId: string;
  txHash: string;
  stage: SendStage;
};

export function persistSendResume(resume: SendResume) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(RESUME_KEY, JSON.stringify(resume));
}

export function readSendResume(): SendResume | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(RESUME_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SendResume;
  } catch {
    return null;
  }
}

export function clearSendResume() {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(RESUME_KEY);
}
