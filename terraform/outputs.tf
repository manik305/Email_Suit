output "ec2_public_ip" {
  description = "The Elastic Public IP of the deployed EC2 server"
  value       = aws_eip.eip.public_ip
}

output "ecr_backend_url" {
  description = "AWS ECR Repository URL for Backend"
  value       = aws_ecr_repository.backend.repository_url
}

output "ecr_frontend_url" {
  description = "AWS ECR Repository URL for Frontend"
  value       = aws_ecr_repository.frontend.repository_url
}

output "ssh_connection_string" {
  description = "SSH Connection string to access the EC2 instance"
  value       = "ssh -i <your-private-key>.pem ubuntu@${aws_eip.eip.public_ip}"
}
