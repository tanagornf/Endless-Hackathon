export interface ShopInstructionCandidate {
  id: string;
  baseVersionId: string | null;
  instruction: string;
  reason: string;
  createdAt: string;
}

export interface ActiveShopInstruction {
  id: string;
  instruction: string;
}

export interface ShopInstructionVersion extends ActiveShopInstruction {
  parentVersionId: string | null;
  restoredFromVersionId: string | null;
  candidateId: string | null;
  actorUserId: string | null;
  createdAt: string;
}

export interface ShopInstructionReview {
  activeVersionId: string | null;
  candidates: ShopInstructionCandidate[];
  versions: ShopInstructionVersion[];
}

export interface ShopInstructionActivation {
  expectedActiveVersionId: string | null;
}
