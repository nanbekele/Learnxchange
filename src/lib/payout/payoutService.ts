export type PayoutResult = {
  ok: boolean;
  reference?: string;
  message?: string;
};

export interface PayoutService {
  sendMoney(phone: string, amount: number): Promise<PayoutResult>;
}

class TelebirrPayoutService implements PayoutService {
  async sendMoney(phone: string, amount: number): Promise<PayoutResult> {
    // Telebirr payout implementation
    // For now, this is a placeholder - actual integration with Telebirr API would go here
    if (!phone || !Number.isFinite(amount) || amount <= 0) {
      return { ok: false, message: "Invalid phone or amount" };
    }

    // Validate Ethiopian phone number format for Telebirr
    const cleanPhone = phone.replace(/\s/g, "");
    const ethiopianPhoneRegex = /^(\+251|251|0)?9\d{8}$/;
    if (!ethiopianPhoneRegex.test(cleanPhone)) {
      return { ok: false, message: "Invalid Ethiopian phone number format. Use 09xxxxxxxx or +2519xxxxxxxx" };
    }

    // TODO: Integrate with actual Telebirr API here
    // For now, return mock success for development
    return {
      ok: true,
      reference: `telebirr_${Date.now()}`,
      message: "Telebirr payout initiated (mock)",
    };
  }
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
    case "telebirr":
      return new TelebirrPayoutService();
    case "mock":
    default:
      return new MockPayoutService();
  }
};
