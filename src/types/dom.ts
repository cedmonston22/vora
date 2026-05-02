export type DOMElementRole =
  | 'button'
  | 'link'
  | 'input'
  | 'textarea'
  | 'select'
  | 'heading'
  | 'text'
  | 'image'
  | 'form'
  | 'other'

export type DOMElement = {
  selector: string // unique CSS selector to target this element
  role: DOMElementRole
  label: string // visible text, aria-label, placeholder, or alt text
  tag: string
  type?: string // for inputs: text, email, checkbox, etc.
  value?: string // current value for inputs (never for password fields)
  href?: string // for links
  disabled?: boolean
  visible: boolean
}

export type PageContext = {
  url: string
  title: string
  elements: DOMElement[]
  headings: string[] // h1-h3 text for orientation
  visibleText: string // trimmed body text, max 2000 chars
}
