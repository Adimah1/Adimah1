export interface VideoRoomProps {
  token: string;
  serverUrl: string;
  otherName: string;
  otherPhoto: string | null;
  onHangUp: () => void;
}
