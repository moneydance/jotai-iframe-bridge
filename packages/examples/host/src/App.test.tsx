import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import App from './App'

describe('Host App', () => {
  test('renders host application title', async () => {
    render(<App />)

    const title = screen.getByText('Host Application')
    expect(title).toBeInTheDocument()
  })

  test('renders HelloWorld component from library', async () => {
    render(<App />)

    // Check that our HelloWorld component is rendered
    const helloWorld = screen.getByText('Hello World! 👋')
    expect(helloWorld).toBeInTheDocument()
  })

  test('displays library attribution', async () => {
    render(<App />)

    const attribution = screen.getByText(/jotai-iframe-bridge workspace package/)
    expect(attribution).toBeInTheDocument()
  })
})
