# Reply quality review

Run from `backend/` with a configured AI provider:

```sh
npm run eval:replies -- /absolute/path/replies.json
```

Append fixture IDs to rerun selected cases (for example `bad-news unknown-answer`).
The report is saved after each completed case so it can be reviewed during a run.

This explicitly makes up to ten live requests using synthetic chats only. It
uses the same provider, request validation, prompts and response normalization
as reply generation. Calls are spaced 35 seconds apart to reduce rate limiting;
the run stops on a provider failure and saves the partial report. It is not part
of the offline test suite. Keep generated reports outside the repository.

Review **every** suggestion against the `review` field in its fixture. Check:

- Does it answer the latest message or preserve the draft's intent?
- Would it sound at home beside the user's own messages?
- Is the language natural without manufactured slang or forced flirting?
- Does it avoid invented facts, extra commitments and unsupported timing claims?
- Does it respect boundaries, including when the requested tone or goal conflicts?

Compare reports from before and after a prompt change with the same provider and
model configuration. Prefer a few repeated samples before making broad quality
claims: output varies, and a successful API call or valid JSON is not evidence
that a reply sounds human. The rubric is for human review, not a synthetic
"human score".

The prompt lives on the backend. Existing APKs receive its changes after the
backend is deployed; rebuilding the Android app alone will not update replies.
