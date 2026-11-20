/** Plain-text SMTP send (same transport notify-leave-request uses). */
export async function sendSmtpEmail(options: {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  to: string[];
  subject: string;
  text: string;
}): Promise<void> {
  const { SMTPClient } = await import('https://deno.land/x/denomailer@1.6.0/mod.ts');
  const client = new SMTPClient({
    connection: {
      hostname: options.host,
      port: options.port,
      tls: true,
      auth: {
        username: options.user,
        password: options.pass,
      },
    },
  });

  try {
    await client.send({
      from: options.from,
      to: options.to,
      subject: options.subject,
      content: options.text,
    });
  } finally {
    await client.close();
  }
}
