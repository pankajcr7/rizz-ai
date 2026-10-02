export const POLICY_UPDATED = "2 October 2026";

export const PRIVACY_SECTIONS = [
  {
    "title": "What stays on your device",
    "body": "Your saved chats, replies, crush notes, progress, style examples and About you settings are saved locally. Turning off history stops new reply-history entries; you can clear local data in Profile. Logging in on another device does not transfer your chat history."
  },
  {
    "title": "When you ask for AI help",
    "body": "The selected chat text, relevant earlier messages, notes, memories, drafts, style examples and About you details are sent to our server and its AI provider to answer your request. Screenshots, profile photos and voice recordings are also sent when you use those features. We remove phone numbers and email addresses from text before forwarding it to the AI; images and audio are not automatically redacted."
  },
  {
    "title": "AI providers",
    "body": "Our server can use Groq, Google Gemini, OpenRouter or Anthropic, including another configured provider when one is busy. Their retention and use of submitted content depend on their terms and account tier. The unpaid Google Gemini service may use submissions to improve products and allow human review. Avoid submitting sensitive information. We do not sell your chats or use them for advertising."
  },
  {
    "title": "What our server keeps",
    "body": "We keep your email, a salted password hash, account identity, daily usage counters, subscription status and invite records. Temporary reset-code hashes expire after 15 minutes. Chat requests are processed in memory; we do not save chats, photos or voice recordings in our database or application logs. AI providers process data under their own policies."
  },
  {
    "title": "Live mode and notifications",
    "body": "Live screen sharing buffers the latest frame in memory while active. Text recognition happens on your phone when you ask to read a chat. Detected conversation text can be kept locally for future context, then sent for AI help. Stop Live mode to end screen sharing. Notification and keyboard features are optional and can be disabled in Android settings."
  },
  {
    "title": "Delete or recover your account",
    "body": "Use Profile → Delete account and confirm your password to remove your account, usage, entitlement and invite records from our database and clear local data on this device. Sessions are revoked. Copies on other devices and information already processed by providers are not removed by clearing this device; manage them separately. Deletion does not cancel store subscriptions; cancel through your app store. Use Log in → Forgot password to recover access by email."
  }
] as const;

export const TERMS_SECTIONS = [
  {
    "title": "Who can use Rizz AI",
    "body": "Rizz AI is for adults aged 18 or older. Use it only for lawful, respectful conversations between adults. Do not use it to harass, pressure, threaten, deceive, or continue contacting someone who asked you to stop."
  },
  {
    "title": "Your choices",
    "body": "You decide what to submit and send. Rizz AI suggests wording and advice; it never sends messages for you. Submit only material you are allowed to use and avoid sensitive information about others. Keep your login details private."
  },
  {
    "title": "AI suggestions and scores",
    "body": "AI can misunderstand a conversation or produce incorrect advice. Review every reply and replace any fill-in before sending. Interest and risk scores are uncertain estimates from the provided text; they are not proof of their feelings or consent."
  },
  {
    "title": "Limits and purchases",
    "body": "Free usage limits reset at midnight UTC; your app shows that time in your timezone. Features can be unavailable when providers are busy. Prices, renewals and purchase terms are shown by your app store. Manage or cancel subscriptions there; deleting the account does not cancel billing."
  },
  {
    "title": "Privacy and accounts",
    "body": "Read the privacy policy before submitting content. You can use guest mode, recover an email account from the login screen, or delete your account in Profile. Local data can be cleared from Profile at any time."
  }
] as const;
