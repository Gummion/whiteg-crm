import { Phone, Mail, MessageCircle, Calendar, FileText, CreditCard, StickyNote, MapPin } from "lucide-react";

export const ACT_ICON: Record<string, React.ElementType> = {
  appel: Phone, email: Mail, whatsapp: MessageCircle, reunion: Calendar, visite: MapPin, devis: FileText, paiement: CreditCard, note: StickyNote,
};
