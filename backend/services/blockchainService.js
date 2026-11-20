const crypto = require('crypto');
const db = require('../db');

/**
 * HeirFlow Immutable Blockchain & Smart Contract Service
 * Records every lifecycle stage of an estate claim as a SHA-256 hash-linked block
 * and enforces smart-contract release conditions for encrypted asset handover.
 */
class BlockchainService {
  static sha256(input) {
    return crypto.createHash('sha256').update(input).digest('hex');
  }

  /**
   * Derives a deterministic smart contract address for an estate claim
   */
  static deriveContractAddress(claimId, deceasedUserId) {
    const hash = this.sha256(`HEIRFLOW-CONTRACT:${claimId}:${deceasedUserId}`);
    return `0x${hash.slice(0, 40)}`;
  }

  /**
   * Ensures a genesis block exists in the ledger
   */
  static ensureGenesis() {
    const blocks = db.blockchain.getBlocks();
    if (blocks.length === 0) {
      const timestamp = new Date().toISOString();
      const dataHash = this.sha256('HEIRFLOW_GENESIS_BLOCK_V1');
      const previousHash = '0'.repeat(64);
      const blockHash = this.sha256(`0|${timestamp}|GENESIS|${dataHash}|${previousHash}`);
      db.blockchain.appendBlock({
        index: 0,
        timestamp,
        claimId: 'GENESIS',
        stage: 'GENESIS',
        actor: 'SYSTEM',
        contractAddress: '0x0000000000000000000000000000000000000000',
        dataHash,
        previousHash,
        blockHash,
        txHash: `0x${blockHash}`,
      });
    }
  }

  /**
   * Appends an immutable stage block for a claim to the blockchain ledger
   */
  static recordStageBlock({ claimId, stage, actor = 'SYSTEM', data = {}, contractAddress }) {
    this.ensureGenesis();
    const blocks = db.blockchain.getBlocks();
    const lastBlock = blocks[blocks.length - 1];

    const index = lastBlock.index + 1;
    const timestamp = new Date().toISOString();
    const resolvedContract = contractAddress || this.deriveContractAddress(claimId, data.deceasedUserId || 'estate');
    const dataHash = this.sha256(JSON.stringify(data));
    const previousHash = lastBlock.blockHash;
    const blockHash = this.sha256(`${index}|${timestamp}|${claimId}|${stage}|${dataHash}|${previousHash}`);

    const block = {
      index,
      timestamp,
      claimId,
      stage,
      actor,
      contractAddress: resolvedContract,
      dataHash,
      previousHash,
      blockHash,
      txHash: `0x${this.sha256(`TX:${blockHash}`).slice(0, 64)}`,
      metadata: data,
    };

    db.blockchain.appendBlock(block);
    return block;
  }

  /**
   * Evaluates Smart Contract conditions and executes release on-chain
   */
  static executeSmartContractRelease({ claimState, encryptedAssetsCount }) {
    const contractAddress = this.deriveContractAddress(claimState.claimId, claimState.deceasedUserId);
    const totalNominees = claimState.quorumConfig?.totalNominees || 1;
    const requiredTwoThirds = Math.max(1, Math.ceil((2 * totalNominees) / 3));
    const sharesCount = (claimState.submittedShares || []).length;

    const conditions = {
      twoThirdsQuorumMet: sharesCount >= requiredTwoThirds,
      registryVerified: claimState.registryResult?.status === 'VERIFIED',
      gracePeriodElapsed: Boolean(claimState.graceEndsAt && Date.now() >= new Date(claimState.graceEndsAt).getTime()),
      notAbortedOrDisputed: !claimState.abortReason && !claimState.disputeReason,
    };

    const allPassed = Object.values(conditions).every(Boolean);
    if (!allPassed) {
      throw new Error(`Smart Contract release conditions failed: ${JSON.stringify(conditions)}`);
    }

    const block = this.recordStageBlock({
      claimId: claimState.claimId,
      stage: 'SMART_CONTRACT_EXECUTED',
      actor: 'SMART_CONTRACT',
      contractAddress,
      data: {
        deceasedUserId: claimState.deceasedUserId,
        conditions,
        sharesCount,
        requiredTwoThirds,
        encryptedAssetsCount,
        keySharesDestroyed: true,
      },
    });

    return {
      contractAddress,
      txHash: block.txHash,
      blockIndex: block.index,
      blockHash: block.blockHash,
      conditions,
    };
  }

  /**
   * Verifies cryptographic hash integrity across the entire blockchain (or claim blocks)
   */
  static verifyChain() {
    const blocks = db.blockchain.getBlocks();
    for (let i = 1; i < blocks.length; i++) {
      const curr = blocks[i];
      const prev = blocks[i - 1];
      if (curr.previousHash !== prev.blockHash) {
        return { valid: false, brokenAtIndex: i, reason: 'previousHash mismatch' };
      }
      const expectedHash = this.sha256(
        `${curr.index}|${curr.timestamp}|${curr.claimId}|${curr.stage}|${curr.dataHash}|${curr.previousHash}`
      );
      if (curr.blockHash !== expectedHash) {
        return { valid: false, brokenAtIndex: i, reason: 'blockHash tampered' };
      }
    }
    return { valid: true, totalBlocks: blocks.length };
  }

  static getClaimLedger(claimId) {
    this.ensureGenesis();
    return {
      chainIntegrity: this.verifyChain(),
      blocks: db.blockchain.getBlocksForClaim(claimId),
    };
  }
}

module.exports = BlockchainService;
