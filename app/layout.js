import "./globals.css";

export const metadata = {
  title: "Voyager 1",
  description: "Apollo GraphQL account-based outreach",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
