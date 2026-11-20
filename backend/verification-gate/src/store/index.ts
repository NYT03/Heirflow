import { ClaimState } from '../types/index.js';

export interface ClaimStore {
  save(claim: ClaimState): void;
  get(claimId: string): ClaimState | undefined;
  listForUser(userId: string): ClaimState[];
  listAll(): ClaimState[];
  clear(): void;
}

export class InMemoryClaimStore implements ClaimStore {
  private claims: Map<string, ClaimState> = new Map();

  public save(claim: ClaimState): void {
    this.claims.set(claim.claimId, claim);
  }

  public get(claimId: string): ClaimState | undefined {
    return this.claims.get(claimId);
  }

  public listForUser(userId: string): ClaimState[] {
    return Array.from(this.claims.values()).filter(
      (c) =>
        c.deceasedUserId === userId ||
        c.claimantId === userId ||
        c.quorumConfig.nomineeIds.includes(userId)
    );
  }

  public listAll(): ClaimState[] {
    return Array.from(this.claims.values());
  }

  public clear(): void {
    this.claims.clear();
  }
}

