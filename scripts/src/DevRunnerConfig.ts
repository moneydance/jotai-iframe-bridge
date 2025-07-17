import { indexByProperty } from './utils/indexBy.js'

export interface ProcessDefinition {
  name: string
  package: string
  script: string
  description: string
  color: string
  tags: string[]
}

export interface DevRunnerConfigOptions {
  title?: string
  processes: ProcessDefinition[]
  includeTags?: string[]
  excludeTags?: string[]
  processNames?: string[]
}

export class DevRunnerConfig {
  private processesMap: Map<string, ProcessDefinition>

  constructor(private config: DevRunnerConfigOptions) {
    this.processesMap = indexByProperty(config.processes, 'name')
  }

  get title(): string {
    return this.config.title || 'Development Environment'
  }

  get processes(): ProcessDefinition[] {
    return this.config.processes
  }

  get includeTags(): string[] | undefined {
    return this.config.includeTags
  }

  get excludeTags(): string[] | undefined {
    return this.config.excludeTags
  }

  get processNames(): string[] | undefined {
    return this.config.processNames
  }

  getProcessConfig(processName: string): ProcessDefinition | undefined {
    return this.processesMap.get(processName)
  }

  buildCommand(processConfig: ProcessDefinition): string {
    return `pnpm --filter ${processConfig.package} ${processConfig.script}`
  }

  getFilteredProcessNames(): string[] {
    let filtered = [...this.processes]

    // Filter by specific process names if provided
    if (this.processNames && this.processNames.length > 0) {
      filtered = filtered.filter((p) => this.processNames?.includes(p.name))
    }

    // Filter by include tags
    if (this.includeTags && this.includeTags.length > 0) {
      filtered = filtered.filter((p) => this.includeTags?.some((tag) => p.tags.includes(tag)))
    }

    // Filter by exclude tags
    if (this.excludeTags && this.excludeTags.length > 0) {
      filtered = filtered.filter((p) => !this.excludeTags?.some((tag) => p.tags.includes(tag)))
    }

    return filtered.map((p) => p.name)
  }
}
