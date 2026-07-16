export interface UsageSummaryDto {
  monthStart: string;
  spentUsd: number;
  inputTokens: number;
  outputTokens: number;
  reportCount: number;
  budgetUsd: number | null;
}

async function parseJsonOrThrow<T>(response: Response, errorMessage: string): Promise<T> {
  if (!response.ok) {
    throw new Error(errorMessage);
  }
  return response.json();
}

export async function getUsageSummary(): Promise<UsageSummaryDto> {
  const response = await fetch('/api/usage');
  return parseJsonOrThrow(response, 'Failed to load usage');
}

export async function setMonthlyBudget(budgetUsd: number | null): Promise<UsageSummaryDto> {
  const response = await fetch('/api/usage/budget', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ budgetUsd })
  });
  return parseJsonOrThrow(response, 'Failed to update budget');
}
