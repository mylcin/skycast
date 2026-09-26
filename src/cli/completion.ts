import type { CommandUnknownOpts } from '@commander-js/extra-typings';

export const SHELLS = ['bash', 'zsh', 'fish'] as const;
export type Shell = (typeof SHELLS)[number];

/**
 * Static completion scripts generated from the command tree, so they never
 * drift from the real commands. Nothing runs on each TAB, and the bash one
 * works on the bash 3.2 that macOS ships, without bash-completion.
 */

interface OptionSpec {
  readonly short?: string;
  readonly long: string;
  readonly description: string;
  readonly takesValue: boolean;
  readonly choices?: readonly string[];
}

interface CommandSpec {
  readonly names: readonly string[];
  readonly description: string;
  readonly options: readonly OptionSpec[];
  /** Choices for the first positional argument, if it has any. */
  readonly choices?: readonly string[];
  readonly commands: readonly CommandSpec[];
}

function describe(command: CommandUnknownOpts, root: boolean): CommandSpec {
  const help = command.createHelp();
  const options = help
    .visibleOptions(command)
    .filter(option => option.long && !(root && option.long === '--version'))
    .map((option): OptionSpec => ({
      long: option.long ?? '',
      ...(option.short && { short: option.short }),
      description: option.description,
      takesValue: option.required || option.optional,
      ...(option.argChoices && { choices: option.argChoices }),
    }));
  const [first] = command.registeredArguments;
  return {
    names: [command.name(), ...command.aliases()],
    description: command.description(),
    options,
    ...(first?.argChoices && { choices: first.argChoices }),
    commands: help
      .visibleCommands(command)
      .filter(sub => sub.name() !== 'help')
      .map(sub => describe(sub, false)),
  };
}

/** Every command path, deepest last, with the options valid there. */
function walk(
  spec: CommandSpec,
  prefix: readonly string[] = []
): { path: readonly string[]; spec: CommandSpec }[] {
  const here = { path: prefix, spec };
  return [
    here,
    ...spec.commands.flatMap(sub =>
      sub.names.flatMap(name => walk(sub, [...prefix, name]))
    ),
  ];
}

const flagsOf = (option: OptionSpec): string[] =>
  option.short ? [option.long, option.short] : [option.long];

// ── bash ────────────────────────────────────────────────────────────────

const bashWord = (word: string): string => word.replace(/[^\w.@/-]/g, '\\$&');

function bash(root: CommandSpec, name: string): string {
  const globals = root.options;
  const paths = walk(root);
  const valued = [
    ...new Set(
      paths
        .flatMap(p => p.spec.options)
        .filter(o => o.takesValue)
        .flatMap(flagsOf)
    ),
  ];
  const choiceCases = [
    ...new Map(
      paths
        .flatMap(p => p.spec.options)
        .filter(o => o.choices)
        .map(o => [flagsOf(o).join('|'), o.choices?.join(' ') ?? ''])
    ),
  ];
  const known = paths
    .filter(p => p.path.length > 0)
    .map(p => bashWord(p.path.join(' ')));
  const cases = paths.map(({ path, spec }) => {
    const words = [
      ...spec.commands.flatMap(sub => sub.names),
      ...[...spec.options, ...(path.length ? globals : [])].flatMap(flagsOf),
    ];
    const pattern = path.length ? `"${path.join(' ')}"` : '""';
    // Choices belong to the first argument only: `config set units <TAB>`
    // must not offer the setting names again.
    const choices = spec.choices ? ` choices="${spec.choices.join(' ')}"` : '';
    return `    ${pattern}) words="${[...new Set(words)].join(' ')}"${choices} ;;`;
  });
  const fn = `_${name.replace(/\W/g, '_')}`;
  return `# ${name} completion for bash (3.2 and later).
# Load it in ~/.bashrc:  eval "$(${name} completion bash)"
${fn}() {
  local cur="\${COMP_WORDS[COMP_CWORD]}" prev="\${COMP_WORDS[COMP_CWORD-1]}"
  local path="" skip=0 args=0 i word next words="" choices=""
  for ((i = 1; i < COMP_CWORD; i++)); do
    word="\${COMP_WORDS[i]}"
    if ((skip)); then skip=0; continue; fi
    case "$word" in
      ${valued.join('|')}) skip=1 ;;
      -*) ;;
      *)
        next="\${path:+$path }$word"
        case "$next" in
          ${known.join('|')}) path="$next" args=0 ;;
          *) args=$((args + 1)) ;;
        esac
        ;;
    esac
  done
  case "$prev" in
${choiceCases.map(([flags, choices]) => `    ${flags}) COMPREPLY=($(compgen -W "${choices}" -- "$cur")); return ;;`).join('\n')}
    ${valued.join('|')}) COMPREPLY=(); return ;;
  esac
  case "$path" in
${cases.join('\n')}
  esac
  if ((args == 0)); then words="$words $choices"; fi
  COMPREPLY=($(compgen -W "$words" -- "$cur"))
}
complete -F ${fn} ${name}
`;
}

// ── zsh ─────────────────────────────────────────────────────────────────

/** Text safe inside a single-quoted zsh _arguments or _describe spec. */
const zshText = (text: string): string =>
  text
    .replace(/\[/g, '(')
    .replace(/\]/g, ')')
    .replace(/:/g, ' -')
    .replace(/'/g, "'\\''");

function zshOption(option: OptionSpec): string {
  const value = option.takesValue
    ? `:${option.long.slice(2)}:${option.choices ? `(${option.choices.join(' ')})` : ' '}`
    : '';
  const description = `[${zshText(option.description)}]`;
  if (!option.short) return `'${option.long}${description}${value}'`;
  return `'(${option.short} ${option.long})'{${option.short},${option.long}}'${description}${value}'`;
}

function zshBody(
  spec: CommandSpec,
  globals: readonly OptionSpec[],
  depth: number
): string {
  const pad = '  '.repeat(depth);
  const options = [...spec.options, ...globals].map(zshOption).join(' ');
  if (spec.commands.length === 0) {
    const positional = spec.choices
      ? `'1: :(${spec.choices.join(' ')})'`
      : `'*: : '`;
    return `${pad}_arguments ${options} ${positional}`;
  }
  const entries = spec.commands
    .flatMap(sub =>
      sub.names.map(name => `'${name}:${zshText(sub.description)}'`)
    )
    .join(' ');
  const branches = spec.commands
    .map(
      sub =>
        `${pad}      ${sub.names.join('|')})\n${zshBody(sub, globals, depth + 4)}\n${pad}        ;;`
    )
    .join('\n');
  return `${pad}local -a commands=(${entries})
${pad}_arguments -C ${options} '1: :->command' '*:: :->args'
${pad}case $state in
${pad}  command) _describe -t commands command commands ;;
${pad}  args)
${pad}    case $words[1] in
${branches}
${pad}    esac
${pad}    ;;
${pad}esac`;
}

function zsh(root: CommandSpec, name: string): string {
  const fn = `_${name.replace(/\W/g, '_')}`;
  // Root options apply everywhere; subcommands add their own.
  const rootSpec: CommandSpec = { ...root, options: [] };
  return `#compdef ${name}
# ${name} completion for zsh.
# Load it in ~/.zshrc:  source <(${name} completion zsh)
# or save it on your fpath:  ${name} completion zsh > "\${fpath[1]}/${fn}"
${fn}() {
  local curcontext="$curcontext" state line
  typeset -A opt_args
${zshBody(rootSpec, root.options, 1)}
}

if [ "$funcstack[1]" = "${fn}" ]; then
  ${fn} "$@"
else
  compdef ${fn} ${name}
fi
`;
}

// ── fish ────────────────────────────────────────────────────────────────

const fishText = (text: string): string =>
  `'${text.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

function fish(root: CommandSpec, name: string): string {
  const lines = [
    `# ${name} completion for fish.`,
    `# Save it:  ${name} completion fish > ~/.config/fish/completions/${name}.fish`,
    `complete -c ${name} -f`,
  ];
  const option = (o: OptionSpec, condition?: string): string =>
    [
      `complete -c ${name}`,
      condition ? `-n ${fishText(condition)}` : '',
      o.short ? `-s ${o.short.slice(1)}` : '',
      `-l ${o.long.slice(2)}`,
      o.takesValue ? '-x' : '',
      o.choices ? `-a ${fishText(o.choices.join(' '))}` : '',
      `-d ${fishText(o.description)}`,
    ]
      .filter(Boolean)
      .join(' ');

  for (const o of root.options) lines.push(option(o));
  for (const { path, spec } of walk(root)) {
    const children = spec.commands.flatMap(sub => sub.names);
    const inHere =
      path.length === 0
        ? '__fish_use_subcommand'
        : `__fish_seen_subcommand_from ${path[path.length - 1]}`;
    const noChild = children.length
      ? `; and not __fish_seen_subcommand_from ${children.join(' ')}`
      : '';
    for (const sub of spec.commands) {
      for (const subName of sub.names) {
        lines.push(
          `complete -c ${name} -n ${fishText(inHere + (path.length ? noChild : ''))} -a ${subName} -d ${fishText(sub.description)}`
        );
      }
    }
    if (path.length === 0) continue;
    for (const o of spec.options) lines.push(option(o, inHere));
    if (spec.choices) {
      // Only right after the command, not for later arguments.
      const first = `${inHere}; and test (count (commandline -opc)) -eq ${path.length + 1}`;
      lines.push(
        `complete -c ${name} -n ${fishText(first)} -a ${fishText(spec.choices.join(' '))}`
      );
    }
  }
  return `${lines.join('\n')}\n`;
}

export function completionScript(
  shell: Shell,
  program: CommandUnknownOpts
): string {
  const spec = describe(program, true);
  const name = program.name();
  switch (shell) {
    case 'bash':
      return bash(spec, name);
    case 'zsh':
      return zsh(spec, name);
    case 'fish':
      return fish(spec, name);
  }
}
