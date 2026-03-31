export type PayoutResult = {
  ok: boolean;
  reference?: string;
  message?: string;
};

export interface PayoutService {
  sendMoney(phone: string, amount: number): Promise<PayoutResult>;
}

class MockPayoutService implements PayoutService {
  async sendMoney(phone: string, amount: number): Promise<PayoutResult> {
    // Mock success for sandbox/dev
    if (!phone || !Number.isFinite(amount) || amount <= 0) {
      return { ok: false, message: "Invalid phone or amount" };
    }

    return {
      ok: true,
      reference: `mock_${Date.now()}`,
      message: "Mock payout sent",
    };
  }
}

export const getPayoutService = (): PayoutService => {
  const provider = (process.env.PAYOUT_PROVIDER ?? "mock").trim().toLowerCase();

  switch (provider) {
    case "mock":
    default:
      return new MockPayoutService();
  }
};
