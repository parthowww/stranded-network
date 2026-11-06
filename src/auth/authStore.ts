export interface UserProfile {
  email: string;
  name: string;
  role: 'operator' | 'dispatcher' | 'auditor' | 'passenger';
  roleLabel: string;
  department: string;
  color: string;
}

const STORAGE_KEY = 'stranded_auth_user';
const TOKEN_KEY = 'stranded_auth_token';

export const authStore = {
  getUser(): UserProfile | null {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  },

  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  },

  setUser(user: UserProfile, token: string = 'session-token') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    localStorage.setItem(TOKEN_KEY, token);
  },

  logout() {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(TOKEN_KEY);
  }
};
