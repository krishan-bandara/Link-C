// Sign-in policy numbers shared by the login routes, the invite pages and the admin panel.
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;
export const PASSWORD_MIN_SCORE = 3; // zxcvbn: 0 weak ... 4 very strong; 3 = "strong" is the minimum
export const LOGIN_MAX_FAILS = 5; // wrong passwords in a row before the email is locked
export const LOGIN_LOCK_MINUTES = 15;
export const INVITE_TTL_HOURS = 24; // invitation and password-reset links work once, for 24 hours
export const GENERIC_LOGIN_ERROR = 'Email or password is incorrect.';
