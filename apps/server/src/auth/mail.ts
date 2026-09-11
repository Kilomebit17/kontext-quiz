import nodemailer, { type Transporter } from 'nodemailer'
import type { Config } from '../config.js'

export interface Mailer {
  /** True when a real SMTP transport is configured. */
  readonly configured: boolean
  sendMagicLink(to: string, link: string): Promise<void>
}

export function createMailer(config: Config): Mailer {
  let transport: Transporter | null = null
  if (config.SMTP_HOST) {
    transport = nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_PORT === 465,
      auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASS ?? '' } : undefined,
    })
  }
  return {
    configured: transport !== null,
    async sendMagicLink(to, link) {
      if (!transport) throw new Error('SMTP is not configured')
      await transport.sendMail({
        from: config.MAIL_FROM,
        to,
        subject: 'Your Kontext Quiz sign-in link',
        text: `Click to sign in to Kontext Quiz:\n\n${link}\n\nThe link is valid for 15 minutes and can be used once.`,
        html: `<p>Click to sign in to <strong>Kontext Quiz</strong>:</p><p><a href="${link}">${link}</a></p><p>The link is valid for 15 minutes and can be used once.</p>`,
      })
    },
  }
}
