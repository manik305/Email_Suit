variable "aws_region" {
  type        = string
  description = "The AWS Region to deploy resources."
  default     = "us-east-1"
}

variable "instance_type" {
  type        = string
  description = "The Instance Type for the EC2 server."
  default     = "t3.micro"
}

variable "aws_key_name" {
  type        = string
  description = "The name of the AWS EC2 SSH key pair to associate with the instance."
}

variable "project_name" {
  type        = string
  description = "Name prefix for the resources."
  default     = "emailsaas"
}
