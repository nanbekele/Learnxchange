/**
 * Chapa API Service
 * Handles balance fetching and payout transfers
 */

const CHAPA_API_BASE = "https://api.chapa.co/v1";

export interface ChapaBalanceResponse {
  message: string;
  status: string;
  data: {
    currency: string;
    ledger_balance: number;
    available_balance: number;
  };
}

export interface ChapaTransferRequest {
  account_name: string;
  account_number: string;
  amount: number;
  currency: string;
  reference: string;
  bank_code: string;
}

export interface ChapaTransferResponse {
  message: string;
  status: string;
  data: {
    reference: string;
    status: string;
    amount: number;
    currency: string;
  };
}

class ChapaService {
  private secretKey: string;

  constructor() {
    this.secretKey = process.env.CHAPA_SECRET_KEY || "";
  }

  /**
   * Fetch current balance from Chapa
   */
  async getBalance(): Promise<{ ledger: number; available: number; currency: string }> {
    if (!this.secretKey) {
      throw new Error("CHAPA_SECRET_KEY not configured");
    }

    const res = await fetch(`${CHAPA_API_BASE}/balances`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`Chapa API error: ${res.status} - ${error}`);
    }

    const data: ChapaBalanceResponse = await res.json();
    
    return {
      ledger: data.data.ledger_balance,
      available: data.data.available_balance,
      currency: data.data.currency,
    };
  }

  /**
   * Transfer money to a bank account or mobile money
   */
  async transfer(req: ChapaTransferRequest): Promise<ChapaTransferResponse> {
    if (!this.secretKey) {
      throw new Error("CHAPA_SECRET_KEY not configured");
    }

    const res = await fetch(`${CHAPA_API_BASE}/transfers`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(req),
    });

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`Chapa transfer failed: ${res.status} - ${error}`);
    }

    return res.json();
  }

  /**
   * Verify a transfer status
   */
  async verifyTransfer(reference: string): Promise<{ status: string; amount: number }> {
    if (!this.secretKey) {
      throw new Error("CHAPA_SECRET_KEY not configured");
    }

    const res = await fetch(`${CHAPA_API_BASE}/transfers/verify/${reference}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) {
      throw new Error(`Failed to verify transfer: ${res.status}`);
    }

    const data = await res.json();
    return {
      status: data.data?.status || "unknown",
      amount: data.data?.amount || 0,
    };
  }
}

export const chapaService = new ChapaService();
