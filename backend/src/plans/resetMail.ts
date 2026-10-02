export type ResetMailer = (email: string, code: string) => Promise<void>;

/** Only sends transactional reset codes; codes never appear in application logs. */
export function resendResetMailer(apiKey: string, from: string, doFetch = fetch): ResetMailer {
  return async (email, code) => {
    const response = await doFetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ from, to: [email], subject: "Your Rizz AI password reset code", text: `Your Rizz AI reset code is ${code}. It expires in 15 minutes and can be used once. If you didn't request this, ignore this email.` }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error("Password reset email could not be delivered");
  };
}
