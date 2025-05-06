import { command, option, subcommands, string as stringType, number as numberType } from 'cmd-ts';
import { faker } from '@faker-js/faker';
import { Resend } from 'resend';

const RandomEmails = (companyName: string) => [
  {
    subject: `${companyName} <> Zero - Investment Opportunity`,
    body: `Hi there,\n\nI'm reaching out from ${companyName} regarding a potential investment opportunity. We believe there could be great synergy between our companies.\n\nWould you be open to a brief conversation?\n\nBest regards`,
  },
  {
    subject: `${companyName} <> Zero - Reach Out / Investment`,
    body: `Hello,\n\nI represent ${companyName} and we're actively looking to invest in innovative companies like yours. We'd love to learn more about your vision.\n\nLet me know if you'd be interested in connecting.\n\nRegards`,
  },
  {
    subject: `${companyName} <> Zero - Series A`,
    body: `Greetings,\n\n${companyName} is currently raising our Series A round and we're looking for strategic partners. We believe your expertise could be valuable.\n\nWould you be interested in learning more?\n\nBest`,
  },
  {
    subject: `${companyName} <> Zero - Partnership Proposal`,
    body: `Hi,\n\n${companyName} is exploring strategic partnerships to accelerate our growth. We think there could be interesting opportunities for collaboration.\n\nWould you be open to discussing this further?\n\nRegards`,
  },
  {
    subject: `${companyName} <> Zero - Business Development`,
    body: `Hello there,\n\nI'm with ${companyName}'s business development team. We're looking to expand our network and explore potential synergies.\n\nWould you be interested in a brief conversation?\n\nBest regards`,
  },
  {
    subject: `${companyName} <> Zero - Strategic Investment`,
    body: `Hi,\n\n${companyName} is seeking strategic investors who can bring more than just capital to the table. We believe your experience could be valuable.\n\nLet me know if you'd like to learn more.\n\nRegards`,
  },
  {
    subject: `${companyName} <> Zero - Growth Opportunity`,
    body: `Greetings,\n\n${companyName} is at an exciting growth stage and we're looking for partners who can help us scale. We'd love to share our vision with you.\n\nWould you be open to a discussion?\n\nBest`,
  },
  {
    subject: `${companyName} <> Zero - Strategic Partnership`,
    body: `Hello,\n\n${companyName} is exploring strategic partnerships to enhance our market position. We believe there could be mutual benefits in working together.\n\nWould you be interested in learning more?\n\nRegards`,
  },
];

const slugify = (text: string) => {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

const handleSend = async (inputs: { to: string; quantity: number }) => {
  const resend = new Resend(process.env.RESEND_API_KEY);
  const to = inputs.to ?? 'nizabizaher@gmail.com';
  const quantity = inputs.quantity ?? 1;

  for (let i = 0; i < quantity; i++) {
    const companyName = faker.company.name();
    const randomEmail =
      RandomEmails(companyName)[Math.floor(Math.random() * RandomEmails(companyName).length)];
    if (randomEmail) {
      const response = await resend.emails.send({
        from: `${faker.person.fullName()} <${slugify(companyName)}@n8n.new>`,
        to,
        subject: randomEmail.subject,
        html: randomEmail.body,
      });

      if (response.error) {
        console.log('Error sending email:', response.error);
      } else {
        console.log('Email sent successfully');
      }
    }
  }
  //   for (const item of arr) {

  //     const randomDelay = Math.floor(Math.random() * 1000);
  //     console.log('Sleeping for', randomDelay, 'ms...');
  //     await new Promise((resolve) => setTimeout(resolve, randomDelay));

  //     if (response.error) {
  //       console.log('Error sending email:', response.error);
  //     } else {
  //       console.log('Email sent successfully');
  //     }
  //   }
};

const send = command({
  name: 'send',
  args: {
    to: option({
      type: stringType,
      long: 'to',
      short: 't',
    }),
    quantity: option({
      type: numberType,
      long: 'quantity',
      short: 'q',
    }),
  },
  handler: async (inputs) => {
    await handleSend(inputs);
  },
});

export const sendEmailsCommand = subcommands({
  name: 'send-emails',
  description: 'Send emails',
  cmds: {
    send,
  },
});
