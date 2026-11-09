import type { IMail } from './mail.service.js';

type Template = Omit<IMail, 'to'>;

const codeMail = (subject: string, intro: string, code: string): Template => ({
  subject,
  text: `${intro}\n\nYour code: ${code}\n\nIt expires in 10 minutes. If you didn't request it, ignore this email.`,
  html: `<p>${intro}</p><p style="font-size:24px;font-weight:bold;letter-spacing:4px">${code}</p><p>It expires in 10 minutes. If you didn't request it, ignore this email.</p>`,
});

export const verifyEmailTemplate = (code: string) =>
  codeMail(
    'Verify your email',
    'Enter this code to finish creating your account.',
    code,
  );

export const resetPasswordTemplate = (code: string) =>
  codeMail(
    'Reset your password',
    'Enter this code to choose a new password.',
    code,
  );

export const alreadyRegisteredTemplate = (): Template => ({
  subject: 'You already have an account',
  text: 'Someone tried to sign up with this email, but it already has an account. Log in, or use "Forgot password" if you don\'t remember your password. If it wasn\'t you, ignore this email.',
  html: '<p>Someone tried to sign up with this email, but it already has an account.</p><p>Log in, or use "Forgot password" if you don\'t remember your password. If it wasn\'t you, ignore this email.</p>',
});
