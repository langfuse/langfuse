export const projectInvitationTemplate = (
  senderName: string,
  recieverEmail: string,
  projectName: string
) => {
  return `<!DOCTYPE html>
  <html lang="en">
  <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Project Invitation</title>
      <style>
          body {
              font-family: Cambria, Cochin, Georgia, Times, 'Times New Roman', serif;
              background-color: #ffffff;
              margin: 0;
              padding: 0;
              color: #ffffff;
          }
  
          .container {
              max-width: 600px;
              margin: 20px auto;
              padding: 20px;
              background-color: #EAEAEA;
              box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
              border-radius: 10px;
          }
  
          img {
              max-width: 100%;
              height: auto;
              width: 60px;
              height: 60px;
          }
  
          h4 {
              color: #66FCF1;
          }
  
          p {
              color: #4B4B4B;
          }
  
          button {
              display: inline-block;
              padding: 10px 20px;
              background-color: #45aaf2;
              color: #ffffff;
              text-decoration: none;
              border-radius: 5px;
              cursor: pointer;
              border: none;
              transition: background-color 0.3s;
          }
  
          button:hover {
              background-color: #3a8bd8;
          }
  
          header {
              text-align: center;
          }
  
          footer {
              margin-top: 20px;
          }
      </style>
  </head>
  <body>
      <div class="container">
          <header>
              <img src="https://i.ibb.co/mqbtq5x/icon256.png" alt="Logo">
          </header>
          
          <main>
              <h4 style="color: #000000;">Hi,</h4>
  
              <p>You've been invited by "${senderName}" to join the team on "${projectName}".Click Following to accept invitations</p>
              
              <a href="http://localhost:3000" style="display: inline-block; padding: 10px 20px; background-color: #D55892; color: #ffffff; text-decoration: none; border-radius: 5px;" target="_blank">Accept the Invite</a>
              
              <p>Thanks,<br> ${process.env.EMAIL_FROM_NAME}</p>
          </main>
          
          <footer style="margin-top: 20px;">
              <p>This email was sent to ${recieverEmail}. If you'd rather not receive this kind of email, you can <a href="#" style="color: #45aaf2;">unsubscribe</a>.</p>
              <p>&copy; 2023 Langfuse. All Rights Reserved.</p>
          </footer>
      </div>
  </body>
  </html>`;
};
