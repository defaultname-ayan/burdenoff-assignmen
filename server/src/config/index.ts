import { IANAZone } from 'luxon';

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) throw new Error(`Environment variable ${name} must be an integer`);
  return parsed;
}

export interface AppConfig {
  readonly databaseUrl: string;
  readonly jwtSecret: string;
  readonly jwtExpiresIn: string;
  readonly agentSignupCode: string;
  readonly businessTimezone: string;
  readonly businessStartHour: number;
  readonly businessEndHour: number;
  readonly port: number;
}

function build(): AppConfig {
  const businessTimezone = process.env['BUSINESS_TIMEZONE'] ?? 'Asia/Kolkata';
  if (!IANAZone.isValidZone(businessTimezone)) {
    throw new Error(`BUSINESS_TIMEZONE "${businessTimezone}" is not a valid IANA timezone`);
  }

  const businessStartHour = optionalInt('BUSINESS_START_HOUR', 9);
  const businessEndHour = optionalInt('BUSINESS_END_HOUR', 18);
  if (businessStartHour < 0 || businessEndHour > 24 || businessStartHour >= businessEndHour) {
    throw new Error('Invalid business hours: require 0 <= START < END <= 24');
  }

  return {
    databaseUrl: required('DATABASE_URL'),
    jwtSecret: required('JWT_SECRET'),
    jwtExpiresIn: process.env['JWT_EXPIRES_IN'] ?? '7d',
    agentSignupCode: process.env['AGENT_SIGNUP_CODE'] ?? '',
    businessTimezone,
    businessStartHour,
    businessEndHour,
    port: optionalInt('PORT', 4000),
  };
}

export const config: AppConfig = build();
