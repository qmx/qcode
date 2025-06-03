interface User {
  id: string;
  name: string;
  email: string;
}

export class UserService {
  async getUser(id: string): Promise<User> {
    // Implementation here
    return { id, name: 'Test', email: 'test@example.com' };
  }
}
