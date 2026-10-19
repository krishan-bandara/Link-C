import HomeDashboard from '../components/home/HomeDashboard';

export const metadata = { title: 'Chats - Link-C' };

// Phones: the shell shows the conversation list full screen here. Wider screens already have the list on the left, so show home.
export default function ChatsPage() {
  return <HomeDashboard />;
}
