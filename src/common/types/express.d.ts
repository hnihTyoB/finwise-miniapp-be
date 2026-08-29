declare global {
  namespace Express {
    interface Request {
      user: {
        id: string;
        email: string | null;
        roleId?: string;
        role: string;
        permissions?: string[];
        apiKeyId?: string;
      };
    }
  }
}

export {};
