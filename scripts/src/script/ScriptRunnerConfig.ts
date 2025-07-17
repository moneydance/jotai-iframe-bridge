export interface ScriptDefinition {
  name: string
  command: string
  description: string
  color: 'cyan' | 'magenta' | 'yellow' | 'blue' | 'green' | 'red' | 'gray'
}

export interface ScriptGroup {
  groupName: string
  children: ScriptConfig[]
}

export type ScriptConfig = ScriptDefinition | ScriptGroup

export interface ScriptRunnerConfigOptions {
  title?: string
  scripts: ScriptConfig[]
}

function isScriptGroup(config: ScriptConfig): config is ScriptGroup {
  return 'groupName' in config
}

function isScriptDefinition(config: ScriptConfig): config is ScriptDefinition {
  return 'name' in config
}

export class ScriptRunnerConfig {
  private navigationPath: string[] = []

  constructor(private config: ScriptRunnerConfigOptions) {}

  get title(): string {
    return this.config.title || 'Script Runner'
  }

  get scripts(): ScriptConfig[] {
    return this.config.scripts
  }

  getCurrentPath(): string[] {
    return [...this.navigationPath]
  }

  getCurrentBreadcrumb(): string {
    if (this.navigationPath.length === 0) return 'Root'
    return this.navigationPath.join(' > ')
  }

  getCurrentOptions(): ScriptConfig[] {
    let current = this.scripts

    for (const pathSegment of this.navigationPath) {
      const group = current.find((item) => isScriptGroup(item) && item.groupName === pathSegment) as
        | ScriptGroup
        | undefined

      if (!group) {
        // Invalid path, reset to root
        this.navigationPath = []
        return this.scripts
      }

      current = group.children
    }

    return current
  }

  navigateInto(groupName: string): boolean {
    const currentOptions = this.getCurrentOptions()
    const targetGroup = currentOptions.find(
      (item) => isScriptGroup(item) && item.groupName === groupName
    ) as ScriptGroup | undefined

    if (targetGroup) {
      this.navigationPath.push(groupName)
      return true
    }

    return false
  }

  navigateBack(): boolean {
    if (this.navigationPath.length > 0) {
      this.navigationPath.pop()
      return true
    }
    return false
  }

  resetNavigation(): void {
    this.navigationPath = []
  }

  findScript(scriptName: string): ScriptDefinition | undefined {
    const currentOptions = this.getCurrentOptions()
    return currentOptions.find((item) => isScriptDefinition(item) && item.name === scriptName) as
      | ScriptDefinition
      | undefined
  }

  buildCommand(scriptDefinition: ScriptDefinition): string {
    return scriptDefinition.command
  }

  isScriptGroup(config: ScriptConfig): config is ScriptGroup {
    return isScriptGroup(config)
  }

  isScriptDefinition(config: ScriptConfig): config is ScriptDefinition {
    return isScriptDefinition(config)
  }
}
