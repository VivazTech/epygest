type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

const RESEND_API_URL = "https://api.resend.com/emails";

export async function sendEmail(input: SendEmailInput): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY não configurada.");
  }

  const from = process.env.RESEND_FROM || "Budget <naoresponda@vivazcataratas.com.br>";

  const res = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    let parsed: { message?: string } | null = null;
    try {
      parsed = JSON.parse(body);
    } catch {
      parsed = null;
    }
    const message = String(parsed?.message || body);
    if (res.status === 403 && /verify a domain/i.test(message)) {
      throw new Error("RESEND_DOMAIN_REQUIRED");
    }
    throw new Error(`Falha ao enviar e-mail (${res.status}): ${body}`);
  }
}
