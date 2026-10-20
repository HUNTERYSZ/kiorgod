import './globals.css';

export const metadata = {
  title: '@Lyon | Discord Message Scheduler',
  description: 'A secure, controlled Discord announcement queue for authorized channels.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
