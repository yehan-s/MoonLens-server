declare module 'passport-gitlab2' {
  import { Strategy as PassportStrategy } from 'passport';
  import { Profile as PassportProfile } from 'passport';

  export interface Profile extends PassportProfile {
    id: string | number;
    username?: string;
    displayName?: string;
    emails?: Array<{ value: string }>;
    _json?: any;
  }

  export class Strategy extends PassportStrategy {
    constructor(options: any, verify: (...args: any[]) => any);
  }
}

