export interface CliArgs {
  files: string[];
  toggleEdit: boolean;
  wayland: boolean;
  panel: boolean;
  background: boolean;
}

export function userArgv(argv: readonly string[], isPackaged: boolean): string[] {
  const rest = argv.slice(1);
  if (isPackaged) return rest;
  const entry = rest.findIndex((a) => !a.startsWith('-'));
  return entry === -1 ? rest : [...rest.slice(0, entry), ...rest.slice(entry + 1)];
}

export function parseArgs(argv: readonly string[]): CliArgs {
  const args: CliArgs = { files: [], toggleEdit: false, wayland: false, panel: false, background: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--toggle-edit') args.toggleEdit = true;
    else if (a === '--wayland') args.wayland = true;
    else if (a === '--panel') args.panel = true;
    else if (a === '--background') args.background = true;
    else if (a === '--add') {
      const file = argv[++i];
      if (file !== undefined) args.files.push(file);
    } else if (a.startsWith('-')) continue;
    else args.files.push(a);
  }
  return args;
}
