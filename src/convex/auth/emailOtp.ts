import { Email } from "@convex-dev/auth/providers/Email";
import axios from "axios";
import { RandomReader, generateRandomString } from "@oslojs/crypto/random";

/**
 * Email OTP provider.
 *
 * Security: the delivery API key lives in the EMAIL_API_KEY environment
 * variable (Keys tab) — never in the source. The fallback constant below is
 * the platform-provided development key: configure EMAIL_API_KEY before any
 * production launch and rotate it if it ever leaked.
 */
const EMAIL_API_KEY = process.env.EMAIL_API_KEY ?? "fb_email_2crN1hqIArZP2bEfvjp5Qik4";

export const emailOtp = Email({
  id: "email-otp",
  maxAge: 60 * 15, // 15 minutes — short-lived codes
  async generateVerificationToken() {
    const random: RandomReader = {
      read(bytes: Uint8Array) {
        crypto.getRandomValues(bytes);
      },
    };
    // 6-digit numeric code, generated from a CSPRNG.
    const alphabet = "0123456789";
    return generateRandomString(random, alphabet, 6);
  },
  async sendVerificationRequest({ identifier: email, token }) {
    try {
      await axios.post(
        "https://auth.freebuff.app/send_otp",
        {
          to: email,
          otp: token,
          appName: process.env.VLY_APP_NAME || "a freebuff.com application",
        },
        {
          headers: {
            "x-api-key": EMAIL_API_KEY,
          },
        },
      );
    } catch (error) {
      throw new Error(JSON.stringify(error));
    }
  },
});
