export type ArtifactFidelity = 'high' | 'medium' | 'low';

export interface CreateArtifactInput {
  agentId: string;
  agentRunId: string;
  kind: string;
  sourceRef: string;
  payloadJson: string;
  fidelity: ArtifactFidelity;
}

export interface ArtifactRecord {
  id: string;
  agentId: string;
  agentRunId: string;
  kind: string;
  sourceRef: string;
  payloadJson: string;
  fidelity: ArtifactFidelity;
  createdAt: Date;
}
