export interface EmailPhrases {
  openers: string[];
  closers: string[];
  custom: string[];
}

export const emailPhrases: EmailPhrases = {
  openers: [
    'Dear {name},\n\n',
    'To whom it may concern,\n\n',
    'Dear Sir/Madam,\n\n',
    'Dear [Job Title],\n\n',

    'Hi {name},\n\n',
    'Hello {name},\n\n',
    'Hey {name},\n\n',

    'Good morning {name},\n\n',
    'Good afternoon {name},\n\n',
    'Good evening {name},\n\n',

    'I hope this email finds you well.\n\n',
    "I trust you're doing well.\n\n",
    "I hope you're having a great week.\n\n",
    'I hope you had a great weekend.\n\n',

    'Following up on our previous conversation,\n\n',
    'As discussed earlier,\n\n',
    'Thank you for your prompt response.\n\n',
    'Thanks for getting back to me.\n\n',
  ],

  closers: [
    'Best regards,\n{name}',
    'Kind regards,\n{name}',
    'Sincerely,\n{name}',
    'Yours sincerely,\n{name}',
    'Yours faithfully,\n{name}',
    'Best wishes,\n{name}',
    'Warm regards,\n{name}',

    'Thanks,\n{name}',
    'Many thanks,\n{name}',
    'Thank you,\n{name}',
    'Cheers,\n{name}',
    'All the best,\n{name}',

    'Looking forward to hearing from you,\n{name}',
    'Looking forward to your response,\n{name}',
    'Please let me know if you have any questions,\n{name}',
    "Don't hesitate to reach out if you need anything,\n{name}",
  ],

  custom: [
    'I wanted to follow up on ',
    "I'm writing to inquire about ",
    "I'm reaching out regarding ",
    'Just checking in on ',
    "I'm pleased to inform you that ",
    'I regret to inform you that ',
    'Please find attached ',
    "I'm looking forward to ",
    'As requested, ',
    'For your reference, ',
    'To summarize our discussion, ',
    'Could you please provide ',
    'I would appreciate your feedback on ',
    'Thank you for your patience ',
    'As mentioned previously, ',
    'Let me know if you need any clarification ',
    "I'll get back to you with more details ",
    'Please review and let me know your thoughts ',
  ],
};
