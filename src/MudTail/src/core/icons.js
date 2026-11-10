// SVG Icon Helper using Lucide icons in Vanilla JS
import {
  Palette,
  Search,
  LayoutDashboard,
  FileCode2,
  Columns,
  FolderTree,
  GitBranch,
  Database,
  Terminal,
  FileText,
  AlertCircle,
  FlaskConical,
  X,
  Pin,
  PinOff,
  Maximize2,
  ChevronDown,
  ChevronRight,
  Sun,
  Moon,
  Copy,
  Check,
  Menu,
  Download,
  Eye,
  EyeOff,
  Lock,
  Mail,
  User,
  ShieldCheck,
  Sliders,
  Sparkles,
  HelpCircle,
  Bell,
  Code
} from 'lucide';

const ICON_MAP = {
  palette: Palette,
  search: Search,
  dashboard: LayoutDashboard,
  docs: FileCode2,
  dock: Columns,
  folder: FolderTree,
  git: GitBranch,
  database: Database,
  terminal: Terminal,
  output: FileText,
  error: AlertCircle,
  test: FlaskConical,
  close: X,
  pin: Pin,
  pinOff: PinOff,
  maximize: Maximize2,
  chevronDown: ChevronDown,
  chevronRight: ChevronRight,
  sun: Sun,
  moon: Moon,
  copy: Copy,
  check: Check,
  menu: Menu,
  download: Download,
  eye: Eye,
  eyeOff: EyeOff,
  lock: Lock,
  mail: Mail,
  user: User,
  shield: ShieldCheck,
  sliders: Sliders,
  sparkles: Sparkles,
  help: HelpCircle,
  bell: Bell,
  code: Code,
};

/**
 * Returns an SVG element for the requested icon name
 */
export function getIconSvg(name, size = 18, className = '') {
  const iconDef = ICON_MAP[name];
  if (!iconDef || !Array.isArray(iconDef)) {
    return `<span class="icon-fallback">${name}</span>`;
  }

  const childSvg = iconDef
    .map((item) => {
      if (!Array.isArray(item)) return '';
      const [childTag, childAttrs] = item;
      const attrsStr = Object.entries(childAttrs || {})
        .map(([k, v]) => `${k}="${v}"`)
        .join(' ');
      return `<${childTag} ${attrsStr}></${childTag}>`;
    })
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-${name} ${className}">${childSvg}</svg>`;
}
